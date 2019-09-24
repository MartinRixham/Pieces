define(["./Library", "./Route"], function ScrollNavPiece(Library, Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		var activeIndex = new Library.Datum(0);

		var currentIndex = new Library.Datum(-1);

		var container = null;

		var routeIndex = -1;

		var moved = false;

		var loaded = false;

		this.pages = new Array(pages.length);

		for (var i = 0; i < pages.length; i++) {

			this.pages[i] = pages[i].page;
		}

		function scroll() {

			if (moved) {

				moved = false;

				return;
			}

			var children = container.children;

			var index = 0;
			var bestTop = Number.MIN_SAFE_INTEGER;
			var found = false;

			for (var i = 0; i < children.length; i++) {

				var child = children[i];
				var top = child.getBoundingClientRect().top - 50;

				if (top <= 0 && top >= bestTop) {

					bestTop = top;
					index = i;
					found = true;
				}
			}

			var oldIndex = currentIndex();

			if (found) {

				currentIndex(index);
			}
			else {

				currentIndex(-1);
			}

			activeIndex(index);

			if (oldIndex != currentIndex()) {

				route.update(routeIndex);
			}
		}

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "pages";
			container.appendChild(page);

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "hidden";
			hidden.style.display = "none";

			element.appendChild(container);
			element.appendChild(hidden);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						if (loaded) {

							var changed = routePage(word);
							route.update(routeIndex);

							return changed;
						}
						else {

							setUpPage(word, routeIndex);
						}
					},
					get: function() {

						if (currentIndex() >= 0) {

							return pages[currentIndex()].route;
						}
						else {

							return "";
						}
					}
				});
		};

		function setUpPage(word, routeIndex) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == word) {

					currentIndex(i);
					route.update(routeIndex);
					deferredLoad(i, 1);

					return;
				}
			}

			loaded = true;
			currentIndex(0);
			route.update(routeIndex);
		}

		function deferredLoad(index, wait) {

			var child = container.children[index];

			if (child && child.firstChild) {

				child.scrollIntoView();
				activeIndex(index);

				loaded = true;
				moved = true;
			}
			else {

				setTimeout(function() {

					deferredLoad(index, wait * 2);
				}, wait);
			}
		}

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					var child = container.children[i];

					if (child) {

						moved = true;

						child.scrollIntoView();
					}

					activeIndex(i);
					currentIndex(i);

					return false;
				}
			}

			moved = true;

			if (container.getBoundingClientRect().top < 50) {

				window.scrollTo(0, 0);
			}

			activeIndex(0);
			currentIndex(-1);

			return false;
		}

		this.hidden =
			new Library.Binding({

				init: function() {

					window.addEventListener("scroll", scroll);
				},
				destroy: function() {

					window.removeEventListener("scroll", scroll);
				}
			});

		this.showPage = function(index) {

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
