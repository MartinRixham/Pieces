define(["./Route"], function(Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		var activeIndex = new Datum(0);

		var currentIndex = new Datum(-1);

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

			if (found) {

				currentIndex(index);
			}
			else {

				currentIndex(-1);
			}

			activeIndex(index);
			route.update(routeIndex);
		}

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

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

							routePage(word);
							route.update(routeIndex);
						}
						else {

							for (var i = 0; i < pages.length; i++) {

								if (pages[i].route == word) {

									currentIndex(i);
									route.update(routeIndex);
									deferredLoad(i, 1);
								}
							}
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

		function deferredLoad(index, wait) {

			var child = container.children[index];

			if (child && child.firstChild) {

				child.scrollIntoView();
				activeIndex(index);

				loaded = true;
				moved = true;

				return;
			}

			setTimeout(function() {

				deferredLoad(index, wait * 2);
			}, wait);
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

					return;
				}
			}

			moved = true;

			window.scrollTo(0, 0);
			activeIndex(0);
			currentIndex(0);
		}

		this.hidden =
			new Binding({

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
