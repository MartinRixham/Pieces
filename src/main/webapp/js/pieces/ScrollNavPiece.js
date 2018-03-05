define(["./Route"], function(Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		var activeIndex = new Datum(0);

		var container = null;

		var routeIndex = -1;

		var scrolling = false;

		var moved = false;

		var scrollRef = {};

		this.pages = new Array(pages.length);

		for (var i = 0; i < pages.length; i++) {

			this.pages[i] = pages[i].page;
		}

		function scroll() {

			if (moved) {

				moved = false;

				return;
			}

			if (scrolling) {

				return;
			}

			var children = container.children;

			var index = 0;
			var bestTop = Number.MIN_SAFE_INTEGER;
			var found = false;

			for (var i = 0; i < children.length; i++) {

				var child = children[i];
				var top = child.getBoundingClientRect().top - 1;

				if (top <= 0 && top >= bestTop) {

					bestTop = top;
					index = i;
					found = true;
				}
			}

			activeIndex(index);

			if (found) {

				route.update(routeIndex);
			}
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

						routePage(word);
						route.update(routeIndex);
					},
					get: function() {

						return pages[activeIndex()].route;
					}
				});
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					var child = container.children[i];

					if (child) {

						moved = true;

						child.scrollIntoView();
					}

					activeIndex(i);

					return;
				}
			}

			activeIndex(0);
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

				scrolling = true;

				var ref = {};
				scrollRef = ref;

				setTimeout(function() {

					if (ref == scrollRef) {

						scrolling = false;
						scroll();
					}
				},
				1000);
			}

			activeIndex(index);
			route.update(routeIndex);
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
